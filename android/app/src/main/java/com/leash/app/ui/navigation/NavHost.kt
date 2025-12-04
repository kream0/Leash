package com.leash.app.ui.navigation

import androidx.compose.runtime.Composable
import androidx.navigation.NavHostController
import androidx.navigation.NavType
import androidx.navigation.compose.NavHost
import androidx.navigation.compose.composable
import androidx.navigation.navArgument
import com.leash.app.data.AgentRepository
import com.leash.app.ui.screens.AgentDetailScreen
import com.leash.app.ui.screens.AgentListScreen

object Routes {
    const val AGENT_LIST = "agents"
    const val AGENT_DETAIL = "agents/{agentId}"
    
    fun agentDetail(agentId: String) = "agents/$agentId"
}

@Composable
fun LeashNavHost(
    navController: NavHostController,
    repository: AgentRepository = AgentRepository()
) {
    NavHost(
        navController = navController,
        startDestination = Routes.AGENT_LIST
    ) {
        composable(Routes.AGENT_LIST) {
            AgentListScreen(
                repository = repository,
                onAgentClick = { agentId ->
                    navController.navigate(Routes.agentDetail(agentId))
                }
            )
        }
        
        composable(
            route = Routes.AGENT_DETAIL,
            arguments = listOf(
                navArgument("agentId") { type = NavType.StringType }
            )
        ) { backStackEntry ->
            val agentId = backStackEntry.arguments?.getString("agentId") ?: return@composable
            AgentDetailScreen(
                agentId = agentId,
                repository = repository,
                onBackClick = { navController.popBackStack() }
            )
        }
    }
}
